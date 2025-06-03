function jsonToDbml(schema) {
    const typeMap = {
      string: 'varchar',
      integer: 'int',
      date: 'date',
      time: 'time',
      text: 'text',
      json: 'json',
      pk: 'pk',
    };
  
    let dbml = '';
  
    const relations = [];
  
    for (const table of schema) {
      dbml += `Table ${table.module} {\n`;
      table.fields  = [{"name":"id","type":"pk"}, ...table.fields]
      console.log(table.fields)
      for (const field of table.fields) {
        if (field.ref) {
          dbml += `  ${field.name} int [ref: > ${field.ref}.id]\n`;
          relations.push(`Ref: ${table.module}.${field.name} > ${field.ref}.id`);
        } else {
          const type = typeMap[field.type] || 'varchar';
          dbml += `  ${field.name} ${type}\n`;
        }
      }
  
      dbml += '}\n\n';
    }
  
    return dbml.trim();
  }
  
  // Example usage:
  const input = [
    {
      module: "patient",
      fields: [
        { name: "first_name", type: "string" },
        { name: "last_name", type: "string" },
        { name: "date_of_birth", type: "date" },
        { name: "email", type: "string" },
        { name: "phone", type: "string" },
        { name: "address", type: "string" },
        { name: "medical_history", type: "text" },
        { name: "insurance_number", type: "string" }
      ]
    },
    {
      module: "doctor",
      fields: [
        { name: "first_name", type: "string" },
        { name: "last_name", type: "string" },
        { name: "specialty", type: "string" },
        { name: "email", type: "string" },
        { name: "phone", type: "string" },
        { name: "license_number", type: "string" },
        { name: "availability", type: "json" }
      ]
    },
    {
      module: "appointment",
      fields: [
        { name: "date", type: "date" },
        { name: "time", type: "time" },
        { name: "duration", type: "integer" },
        { name: "status", type: "string" },
        { name: "notes", type: "text" },
        { name: "patient_id", ref: "patient" },
        { name: "doctor_id", ref: "doctor" }
      ]
    }
  ];
  
  console.log(jsonToDbml(input));
  