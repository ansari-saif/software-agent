export type SchemaField = {
  name: string;
  type?: string;
  ref?: string;
};

export type SchemaModule = {
  module: string;
  fields: SchemaField[];
};

export type Schema = SchemaModule[]; 