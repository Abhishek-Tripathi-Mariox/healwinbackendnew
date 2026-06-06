declare module "node-input-validator" {
  export class Validator {
    constructor(data: Record<string, any>, rules: Record<string, string>);

    check(): Promise<boolean>;
    errors: any;
  }

  const validator: any;
  export default validator;
}
