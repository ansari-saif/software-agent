export interface Field {
  name: string;
  type?: string;
  ref?: string;
}

export interface Module {
  module: string;
  fields: Field[];
}

export function isField(obj: any): obj is Field {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.name === 'string' &&
    (obj.type === undefined || typeof obj.type === 'string') &&
    (obj.ref === undefined || typeof obj.ref === 'string')
  );
}

export function isModule(obj: any): obj is Module {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.module === 'string' &&
    Array.isArray(obj.fields) &&
    obj.fields.every((field: any) => isField(field))
  );
}

export function isModuleArray(obj: any): obj is Module[] {
  return Array.isArray(obj) && obj.every(item => isModule(item));
} 