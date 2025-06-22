import { Field, Module } from '../types/dbml';

export class DbmlGeneratorService {
  private static capitalizeFirstLetter(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private static generateTableName(moduleName: string): string {
    return this.capitalizeFirstLetter(moduleName);
  }

  private static generateFieldType(field: Field): string {
    if (!field.type) return 'int'; // Default type for reference fields

    const typeMap: { [key: string]: string } = {
      'string': 'varchar',
      'text': 'text',
      'date': 'date',
      'decimal': 'decimal',
      'integer': 'int',
      'boolean': 'boolean'
    };

    return typeMap[field.type.toLowerCase()] || field.type;
  }

  private static generateField(field: Field): string {
    const fieldType = this.generateFieldType(field);
    if (field.ref) {
      // Handle reference field
      return `  ${field.name} int [ref: > ${this.capitalizeFirstLetter(field.ref)}.id]`;
    }
    return `  ${field.name} ${fieldType}`;
  }

  public static generateDbml(jsonSchema: Module[]): string {
    let dbml = '// Database schema generated from JSON\n\n';

    // First, add default id field to all tables
    jsonSchema.forEach(module => {
      const tableName = this.generateTableName(module.module);
      dbml += `Table ${tableName} {\n`;
      dbml += '  id int [pk, increment]\n';
      
      // Add all fields
      module.fields.forEach(field => {
        dbml += `${this.generateField(field)}\n`;
      });

      // Add created_at and updated_at timestamps
      dbml += '  created_at timestamp\n';
      dbml += '  updated_at timestamp\n';
      dbml += '}\n\n';
    });

    return dbml.trim();
  }
} 