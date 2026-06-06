export type Lang = "en" | string;

export type MessageKey =
  | "user_already_found"
  | "success"
  | "logout"
  | "invalid_token"
  | "users_list"
  | "user_not_found"
  | "forbidden"
  | "otp_sent"
  | "otp_verified"
  | "incorrect_otp"
  | "status_changed"
  | "interest_exists"
  | "validation_failed"
  | "patient_created"
  | "patient_updated"
  | "patient_list"
  | "patient_detail"
  | "patient_not_found"
  | "patient_deleted"
  | "document_added"
  | "encounter_created"
  | "encounter_updated"
  | "encounter_list"
  | "encounter_detail"
  | "encounter_not_found"
  | "item_created"
  | "item_updated"
  | "item_list"
  | "item_detail"
  | "item_not_found"
  | "item_deleted"
  | "stock_adjusted"
  | "alerts_list"
  | "invoice_created"
  | "invoice_updated"
  | "invoice_list"
  | "invoice_detail"
  | "invoice_not_found"
  | "payment_recorded"
  | "refund_processed"
  | "report_generated"
  | "appointment_created"
  | "appointment_updated"
  | "appointment_list"
  | "appointment_not_found"
  | "admission_created"
  | "admission_updated"
  | "admission_list"
  | "admission_detail"
  | "admission_not_found"
  | "bed_created"
  | "bed_updated"
  | "bed_list"
  | "bed_not_found"
  | "not_available"
  | "pharmacy_created"
  | "pharmacy_updated"
  | "pharmacy_list"
  | "pharmacy_detail"
  | "pharmacy_not_found"
  | "pharmacy_deleted"
  | "pharmacy_submitted"
  | "escalation_started"
  | "escalation_updated"
  | "escalation_list"
  | "escalation_detail"
  | "escalation_not_found"
  // HR & Payroll
  | "employee_created"
  | "employee_updated"
  | "employee_list"
  | "employee_detail"
  | "employee_not_found"
  | "employee_deleted"
  | "salary_structure_updated"
  | "attendance_marked"
  | "attendance_list"
  | "attendance_summary"
  | "leave_type_saved"
  | "leave_type_list"
  | "leave_request_created"
  | "leave_request_list"
  | "leave_request_updated"
  | "leave_request_not_found"
  | "leave_balance_list"
  | "holiday_saved"
  | "holiday_list"
  | "holiday_not_found"
  | "holiday_deleted"
  | "payroll_generated"
  | "payrun_list"
  | "payrun_detail"
  | "payrun_not_found"
  | "payrun_finalized"
  | "payslip_detail"
  | "payslip_not_found"
  | "hr_dashboard";

type MessageMap = Record<MessageKey, string>;

export default function messages(lang: Lang = "en"): MessageMap {
  const data: Record<MessageKey, Record<string, string>> = {
    user_already_found: {
      en: "User already found with given username, Try again after new username!",
    },
    success: {
      en: "success",
    },
    logout: {
      en: "logout successfully",
    },
    invalid_token: {
      en: "invalid token",
    },
    users_list: {
      en: "users list",
    },
    user_not_found: {
      en: "user detail not found with given id",
    },
    forbidden: {
      en: "forbidden",
    },
    otp_sent: {
      en: "otp send to your register mobile number",
    },
    otp_verified: {
      en: "login successfully",
    },
    incorrect_otp: {
      en: "incorrect otp, try again!",
    },
    status_changed: {
      en: "status changed successfully",
    },
    interest_exists: {
      en: "you have added this interest before",
    },
    validation_failed: {
      en: "validation failed, please check the submitted fields",
    },
    patient_created: {
      en: "patient registered successfully",
    },
    patient_updated: {
      en: "patient updated successfully",
    },
    patient_list: {
      en: "patient list",
    },
    patient_detail: {
      en: "patient detail",
    },
    patient_not_found: {
      en: "patient not found with given id",
    },
    patient_deleted: {
      en: "patient deleted successfully",
    },
    document_added: {
      en: "document uploaded successfully",
    },
    encounter_created: {
      en: "encounter (EMR) created successfully",
    },
    encounter_updated: {
      en: "encounter (EMR) updated successfully",
    },
    encounter_list: {
      en: "encounter list",
    },
    encounter_detail: {
      en: "encounter detail",
    },
    encounter_not_found: {
      en: "encounter not found with given id",
    },
    item_created: { en: "inventory item created successfully" },
    item_updated: { en: "inventory item updated successfully" },
    item_list: { en: "inventory item list" },
    item_detail: { en: "inventory item detail" },
    item_not_found: { en: "inventory item not found with given id" },
    item_deleted: { en: "inventory item deleted successfully" },
    stock_adjusted: { en: "stock adjusted successfully" },
    alerts_list: { en: "inventory alerts" },
    invoice_created: { en: "invoice created successfully" },
    invoice_updated: { en: "invoice updated successfully" },
    invoice_list: { en: "invoice list" },
    invoice_detail: { en: "invoice detail" },
    invoice_not_found: { en: "invoice not found with given id" },
    payment_recorded: { en: "payment recorded successfully" },
    refund_processed: { en: "refund processed successfully" },
    report_generated: { en: "report generated" },
    appointment_created: { en: "appointment booked successfully" },
    appointment_updated: { en: "appointment updated successfully" },
    appointment_list: { en: "appointment list" },
    appointment_not_found: { en: "appointment not found with given id" },
    admission_created: { en: "patient admitted successfully" },
    admission_updated: { en: "admission updated successfully" },
    admission_list: { en: "admission list" },
    admission_detail: { en: "admission detail" },
    admission_not_found: { en: "admission not found with given id" },
    bed_created: { en: "bed created successfully" },
    bed_updated: { en: "bed updated successfully" },
    bed_list: { en: "bed list" },
    bed_not_found: { en: "bed not found with given id" },
    not_available: { en: "resource is not available" },
    pharmacy_created: { en: "pharmacy created successfully" },
    pharmacy_updated: { en: "pharmacy updated successfully" },
    pharmacy_list: { en: "pharmacy list" },
    pharmacy_detail: { en: "pharmacy detail" },
    pharmacy_not_found: { en: "pharmacy not found with given id" },
    pharmacy_deleted: { en: "pharmacy deleted successfully" },
    pharmacy_submitted: {
      en: "pharmacy listing submitted for review",
    },
    escalation_started: { en: "IVR escalation started" },
    escalation_updated: { en: "escalation updated" },
    escalation_list: { en: "escalation list" },
    escalation_detail: { en: "escalation detail" },
    escalation_not_found: { en: "escalation not found with given id" },
    // HR & Payroll
    employee_created: { en: "employee created successfully" },
    employee_updated: { en: "employee updated successfully" },
    employee_list: { en: "employee list" },
    employee_detail: { en: "employee detail" },
    employee_not_found: { en: "employee not found with given id" },
    employee_deleted: { en: "employee deleted successfully" },
    salary_structure_updated: { en: "salary structure updated successfully" },
    attendance_marked: { en: "attendance saved successfully" },
    attendance_list: { en: "attendance list" },
    attendance_summary: { en: "attendance summary" },
    leave_type_saved: { en: "leave type saved successfully" },
    leave_type_list: { en: "leave type list" },
    leave_request_created: { en: "leave request submitted successfully" },
    leave_request_list: { en: "leave request list" },
    leave_request_updated: { en: "leave request updated successfully" },
    leave_request_not_found: { en: "leave request not found with given id" },
    leave_balance_list: { en: "leave balance list" },
    holiday_saved: { en: "holiday saved successfully" },
    holiday_list: { en: "holiday list" },
    holiday_not_found: { en: "holiday not found with given id" },
    holiday_deleted: { en: "holiday deleted successfully" },
    payroll_generated: { en: "payroll generated successfully" },
    payrun_list: { en: "payroll run list" },
    payrun_detail: { en: "payroll run detail" },
    payrun_not_found: { en: "payroll run not found with given id" },
    payrun_finalized: { en: "payroll run finalized successfully" },
    payslip_detail: { en: "payslip detail" },
    payslip_not_found: { en: "payslip not found with given id" },
    hr_dashboard: { en: "hr dashboard" },
  };

  // fallback to English
  const result = {} as MessageMap;

  (Object.keys(data) as MessageKey[]).forEach((key) => {
    result[key] = data[key][lang] || data[key]["en"];
  });

  return result;
}
