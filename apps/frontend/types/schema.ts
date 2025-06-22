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

export type Project = {
  id: string;
  description?: string;
  dbml_id?: string;
  dbml_diagram_id?: string;
  createdAt: string;
  updatedAt: string;
  userId: string;
  schema?: Schema;
}; 