// TODO : REMOVE ME
const fs = require('fs');
const readline = require('readline');

function generateOpenApiFile(inputContent, openApiStructure) {
    const modules = JSON.parse(inputContent);
    
    // Function to update paths and schemas for a given module
    function addModuleToOpenApi(module, openApiStructure) {
        const moduleName = module.module;
        const basePath = `/api/v1/${moduleName}/`;
        const itemPath = `/api/v1/${moduleName}/{${moduleName}_id}`;
        
        // Add paths for GET and POST
        if (!openApiStructure.paths[basePath]) {
            openApiStructure.paths[basePath] = {
                "get": {
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
                },
                "post": {
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
                }
            };
        }
        
        // Add paths for GET, PUT, and DELETE for an individual item
        if (!openApiStructure.paths[itemPath]) {
            openApiStructure.paths[itemPath] = {
                "get": {
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
                },
                "put": {
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
                },
                "delete": {
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
                }
            };
        }
        
        // Initialize schemas for Create, Read, and Update
        const createSchema = {
            "properties": {},
            "type": "object",
            "required": [],
            "title": `${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Create`
        };
        
        const readSchema = {
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
        
        const updateSchema = {
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
        
        // Add schemas to components if not already present
        const schemas = openApiStructure.components.schemas;
        schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Create`] = createSchema;
        schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Read`] = readSchema;
        schemas[`${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}Update`] = updateSchema;
    }
    
    // Add each module to the OpenAPI structure
    for (const module of modules) {
        addModuleToOpenApi(module, openApiStructure);
    }

    let openApiFilePath = "openapi.json"
    // Write the updated OpenAPI structure back to the file
    fs.writeFileSync(openApiFilePath, JSON.stringify(openApiStructure, null, 2));
    console.log(`Updated OpenAPI spec saved to ${openApiFilePath}`);
}

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Get user input
rl.question('Input content: ', (inputContent) => {
    rl.question('Output Path: ', (outputPath) => {
        try {
            generateOpenApiFile(inputContent, outputPath);
        } catch (error) {
            console.error('Error generating OpenAPI file:', error.message);
        } finally {
            rl.close();
        }
    });
});