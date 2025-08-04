export interface OpenApiField {
  name: string;
  type: string;
}

export interface OpenApiModule {
  module: string;
  fields: OpenApiField[];
}

export interface OpenApiSchema {
  properties: Record<string, any>;
  type: string;
  required: string[];
  title: string;
}

export interface OpenApiStructure {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  paths: Record<string, any>;
  components: {
    schemas: Record<string, any>;
  };
}

export class OpenApiProcessor {
  /**
   * Process OpenAPI data by converting schema modules into OpenAPI specification
   */
  static processOpenApiData(inputContent: OpenApiModule | OpenApiModule[], openApiStructure: OpenApiStructure): OpenApiStructure {
    const modules = Array.isArray(inputContent) ? inputContent : [inputContent];
    
    // Add each module to the OpenAPI structure
    for (const module of modules) {
      this.addModuleToOpenApi(module, openApiStructure);
    }
    
    return openApiStructure;
  }

  /**
   * Add a single module to the OpenAPI structure
   */
  private static addModuleToOpenApi(module: OpenApiModule, openApiStructure: OpenApiStructure): void {
    const moduleName = module.module;
    const basePath = `/api/v1/${moduleName}/`;
    const itemPath = `/api/v1/${moduleName}/{${moduleName}_id}`;
    
    // Add paths for GET and POST
    if (!openApiStructure.paths[basePath]) {
      openApiStructure.paths[basePath] = {
        "get": this.createListEndpoint(moduleName),
        "post": this.createCreateEndpoint(moduleName)
      };
    }
    
    // Add paths for GET, PUT, and DELETE for an individual item
    if (!openApiStructure.paths[itemPath]) {
      openApiStructure.paths[itemPath] = {
        "get": this.createGetEndpoint(moduleName),
        "put": this.createUpdateEndpoint(moduleName),
        "delete": this.createDeleteEndpoint(moduleName)
      };
    }
    
    // Create and add schemas
    const { createSchema, readSchema, updateSchema } = this.createSchemas(module);
    
    // Add schemas to components
    const schemas: any = openApiStructure.components.schemas;
    schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Create`] = createSchema;
    schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`] = readSchema;
    schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Update`] = updateSchema;
  }

  /**
   * Create list endpoint specification
   */
  private static createListEndpoint(moduleName: string): any {
    return {
      "tags": [moduleName],
      "summary": `List All ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
      "operationId": `list_all_${moduleName}_api_v1_${moduleName}__get`,
      "responses": {
        "200": {
          "description": "Successful Response",
          "content": {
            "application/json": {
              "schema": {
                "items": {
                  "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`
                },
                "type": "array",
                "title": `Response List All ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Api V1 ${moduleName} Get`
              }
            }
          }
        }
      }
    };
  }

  /**
   * Create endpoint specification
   */
  private static createCreateEndpoint(moduleName: string): any {
    return {
      "tags": [moduleName],
      "summary": `Create ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
      "operationId": `create_${moduleName}_api_v1_${moduleName}__post`,
      "requestBody": {
        "content": {
          "application/json": {
            "schema": {
              "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Create`
            }
          }
        },
        "required": true
      },
      "responses": {
        "200": {
          "description": "Successful Response",
          "content": {
            "application/json": {
              "schema": {
                "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`
              }
            }
          }
        }
      }
    };
  }

  /**
   * Get single item endpoint specification
   */
  private static createGetEndpoint(moduleName: string): any {
    return {
      "tags": [moduleName],
      "summary": `Get a single ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
      "operationId": `get_${moduleName}_api_v1_${moduleName}_id__get`,
      "parameters": [
        {
          "name": `${moduleName}_id`,
          "in": "path",
          "required": true,
          "schema": {
            "type": "integer",
            "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Id`
          }
        }
      ],
      "responses": {
        "200": {
          "description": "Successful Response",
          "content": {
            "application/json": {
              "schema": {
                "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`
              }
            }
          }
        }
      }
    };
  }

  /**
   * Update endpoint specification
   */
  private static createUpdateEndpoint(moduleName: string): any {
    return {
      "tags": [moduleName],
      "summary": `Update a ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
      "operationId": `update_${moduleName}_api_v1_${moduleName}_id__put`,
      "parameters": [
        {
          "name": `${moduleName}_id`,
          "in": "path",
          "required": true,
          "schema": {
            "type": "integer",
            "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Id`
          }
        }
      ],
      "requestBody": {
        "content": {
          "application/json": {
            "schema": {
              "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Update`
            }
          }
        },
        "required": true
      },
      "responses": {
        "200": {
          "description": "Successful Response",
          "content": {
            "application/json": {
              "schema": {
                "$ref": `#/components/schemas/${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`
              }
            }
          }
        }
      }
    };
  }

  /**
   * Delete endpoint specification
   */
  private static createDeleteEndpoint(moduleName: string): any {
    return {
      "tags": [moduleName],
      "summary": `Delete a ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`,
      "operationId": `delete_${moduleName}_api_v1_${moduleName}_id__delete`,
      "parameters": [
        {
          "name": `${moduleName}_id`,
          "in": "path",
          "required": true,
          "schema": {
            "type": "integer",
            "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Id`
          }
        }
      ],
      "responses": {
        "204": {
          "description": "No Content"
        }
      }
    };
  }

  /**
   * Create schemas for Create, Read, and Update operations
   */
  private static createSchemas(module: OpenApiModule): { createSchema: any; readSchema: any; updateSchema: any } {
    const moduleName = module.module;
    
    const createSchema: any = {
      "properties": {},
      "type": "object",
      "required": [],
      "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Create`
    };
    
    const readSchema: any = {
      "properties": {
        "id": {
          "type": "integer",
          "title": "Id"
        }
      },
      "type": "object",
      "required": ["id"],
      "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`
    };
    
    const updateSchema: any = {
      "properties": {},
      "type": "object",
      "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Update`
    };
    
    // Add fields to the schemas
    for (const field of module.fields) {
      const fieldName = field.name;
      const fieldType = field.type;
      
      // Update Create schema
      createSchema.properties[fieldName] = {
        "type": fieldType,
        "title": fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
      };
      createSchema.required.push(fieldName);
      
      // Update Read schema
      readSchema.properties[fieldName] = {
        "type": fieldType,
        "title": fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
      };
      readSchema.required.push(fieldName);
      
      // Update Update schema (optional fields)
      updateSchema.properties[fieldName] = {
        "type": fieldType,
        "title": fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
      };
    }
    
    return { createSchema, readSchema, updateSchema };
  }

  /**
   * Initialize a new OpenAPI structure
   */
  static initializeOpenApiStructure(projectTitle: string = "API"): OpenApiStructure {
    return {
      "openapi": "3.0.0",
      "info": {
        "title": `${projectTitle} - OpenAPI`,
        "version": "1.0.0",
        "description": "API documentation generated from project schema"
      },
      "paths": {},
      "components": {
        "schemas": {}
      }
    };
  }

  /**
   * Check if an object is a valid OpenAPI structure
   */
  static isValidOpenApiStructure(data: any): data is OpenApiStructure {
    return data && typeof data === 'object' && data.openapi === "3.0.0";
  }
} 