#!/usr/bin/env bash
#
# Manual smoke test for the ambulance dispatch core loop.
# Walks one full happy-path: provider -> staff -> ambulance -> assign ->
# staff OTP login -> duty on -> location ping -> nearby -> dispatch ->
# accept -> en-route -> on-scene -> complete.
#
# Required env vars:
#   BASE_URL         e.g. http://localhost:4000/v1/api
#   ADMIN_TOKEN      JWT for an existing admin
#   STATE_ID         existing State ObjectId
#   DISTRICT_ID      existing District ObjectId
#   SOS_ID           existing SOSAlert ObjectId near coords below
#   STAFF_OTP        the OTP printed by the backend after /login
#                    (run the script in two passes; see notes)
#
# Optional:
#   PATIENT_LAT, PATIENT_LNG  defaults to Connaught Place, Delhi.
#
# Notes:
# - The script runs in two phases. Phase 1 stops after staff /login so you
#   can read the OTP from the backend console. Re-run with STAFF_OTP set
#   to continue.

set -euo pipefail

: "${BASE_URL:?BASE_URL required}"
: "${ADMIN_TOKEN:?ADMIN_TOKEN required}"
: "${STATE_ID:?STATE_ID required}"
: "${DISTRICT_ID:?DISTRICT_ID required}"
: "${SOS_ID:?SOS_ID required}"

PATIENT_LAT="${PATIENT_LAT:-28.6139}"
PATIENT_LNG="${PATIENT_LNG:-77.2090}"

jq_get() { jq -r "$1" <<<"$2"; }

echo "==> Create provider"
PROVIDER=$(curl -sS -X POST "$BASE_URL/admin/service-providers" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"SmokeAmb\",\"contactPersonName\":\"Ops\",\"phone\":\"9876543210\",\"state\":\"$STATE_ID\",\"district\":\"$DISTRICT_ID\"}")
PROVIDER_ID=$(jq_get '.rData._id // .rData.provider._id // .data._id' "$PROVIDER")
echo "    providerId=$PROVIDER_ID"

echo "==> Create driver"
DRIVER=$(curl -sS -X POST "$BASE_URL/admin/ambulance-staff" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"providerId\":\"$PROVIDER_ID\",\"role\":\"driver\",\"mobileNumber\":\"9999999001\",\"fullName\":\"Smoke Driver\",\"licenseNumber\":\"DL-SMK-1\"}")
DRIVER_ID=$(jq_get '.rData._id // .rData.staff._id // .data._id' "$DRIVER")
echo "    driverId=$DRIVER_ID"

echo "==> Create attendant"
ATT=$(curl -sS -X POST "$BASE_URL/admin/ambulance-staff" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"providerId\":\"$PROVIDER_ID\",\"role\":\"attendant\",\"mobileNumber\":\"9999999002\",\"fullName\":\"Smoke Attendant\",\"certifications\":[\"EMT-Basic\"]}")
ATT_ID=$(jq_get '.rData._id // .rData.staff._id // .data._id' "$ATT")
echo "    attendantId=$ATT_ID"

echo "==> Create ambulance"
AMB=$(curl -sS -X POST "$BASE_URL/admin/ambulances" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"providerId\":\"$PROVIDER_ID\",\"registrationNumber\":\"DLSMK1234\",\"ambulanceType\":\"BLS\"}")
AMB_ID=$(jq_get '.rData._id // .rData.ambulance._id // .data._id' "$AMB")
echo "    ambulanceId=$AMB_ID"

echo "==> Assign driver + attendant"
curl -sS -X POST "$BASE_URL/admin/ambulances/$AMB_ID/assign" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"driverId\":\"$DRIVER_ID\",\"attendantId\":\"$ATT_ID\"}" >/dev/null
echo "    assigned"

echo "==> Driver OTP login (read OTP from backend console)"
curl -sS -X POST "$BASE_URL/ambulance-staff-auth/login" \
  -H "Content-Type: application/json" \
  -d '{"mobileNumber":"9999999001"}' >/dev/null

if [[ -z "${STAFF_OTP:-}" ]]; then
  echo "    Re-run with STAFF_OTP=<otp> to continue."
  exit 0
fi

VERIFY=$(curl -sS -X POST "$BASE_URL/ambulance-staff-auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"mobileNumber\":\"9999999001\",\"otp\":\"$STAFF_OTP\"}")
STAFF_TOKEN=$(jq_get '.rData.token // .data.token' "$VERIFY")
echo "    got staff token"

echo "==> Driver duty on + location ping near patient"
curl -sS -X POST "$BASE_URL/ambulance-staff/duty" \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"isDutyOn":true}' >/dev/null
curl -sS -X POST "$BASE_URL/ambulance-staff/location" \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d "{\"lat\":$PATIENT_LAT,\"lng\":$PATIENT_LNG}" >/dev/null

echo "==> Admin: nearby ambulances for SOS"
NEAR=$(curl -sS -X GET "$BASE_URL/admin/sos/$SOS_ID/nearby-ambulances" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
echo "$NEAR" | jq '.rData.ambulances // .data.ambulances | length' \
  | xargs -I{} echo "    {} ambulance(s) returned"

echo "==> Admin: dispatch"
DISPATCH=$(curl -sS -X POST "$BASE_URL/admin/sos/$SOS_ID/dispatch" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d "{\"ambulanceId\":\"$AMB_ID\"}")
DISPATCH_ID=$(jq_get '.rData._id // .rData.dispatch._id // .data._id' "$DISPATCH")
echo "    dispatchId=$DISPATCH_ID"

echo "==> Driver: accept -> en-route -> on-scene -> complete"
for action in accept en-route on-scene complete; do
  curl -sS -X POST "$BASE_URL/dispatches/$DISPATCH_ID/$action" \
    -H "Authorization: Bearer $STAFF_TOKEN" >/dev/null
  echo "    $action ok"
done

echo "==> Smoke loop completed."
