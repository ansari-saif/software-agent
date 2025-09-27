// Mock Anthropic Client Simulator
export class AnthropicSimulator {
  messages = {
    stream: (options: any) => {
      return new MockStream(options);
    },
  };
}

// Define interfaces for better type safety
interface Schema {
  name?: string;
  fields?: string[];
}

interface StreamOptions {
  messages: Array<{ role: string; content: string }>;
  system?: string;
  model?: string;
  max_tokens?: number;
}

class MockStream {
  private listeners: { [event: string]: Function[] } = {};
  private options: StreamOptions;

  constructor(options: StreamOptions) {
    this.options = options;
  }

  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);

    // Auto-start simulation when all listeners are attached
    if (event === "error") {
      setTimeout(() => this.simulateStreaming(), 100);
    }

    return this;
  }

  private emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((callback) => callback(data));
    }
  }

  private async simulateStreaming() {
    try {
      // Extract schema from the user message
      const userMessage = this.options.messages.find((m) => m.role === "user");
      const schema = this.extractSchemaFromMessage(userMessage?.content || "");

      // Generate realistic backend code based on schema
      const mockBackendCode = this.generateMockBackendCode(schema);

      // Simulate streaming by sending chunks
      const chunks = this.splitIntoChunks(mockBackendCode, 50);

      for (let i = 0; i < chunks.length; i++) {
        await this.delay(20); // Simulate network delay
        this.emit("text", chunks[i]);
      }

      // Emit final message
      await this.delay(40);
      this.emit("finalMessage", { content: mockBackendCode });
    } catch (error) {
      this.emit("error", error);
    }
  }

  private extractSchemaFromMessage(message: string): Schema {
    try {
      // Extract JSON from the message
      const jsonMatch = message.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as Schema;
      }
    } catch (e) {
      // Fallback to default schema
    }
    return { name: "User", fields: ["id", "name", "email"] };
  }

  private generateMockBackendCode(schema: Schema): string {
    const modelName = schema.name || "User";
    const fields = schema.fields || ["id", "name", "email"];

    return `
  <artifact type="application/vnd.ant.code" language="javascript" title="${modelName} Backend Implementation">
  // ${modelName} Model Implementation
  const express = require('express');
  const { PrismaClient } = require('@prisma/client');
  const router = express.Router();
  const prisma = new PrismaClient();
  
  // GET all ${modelName.toLowerCase()}s
  router.get('/${modelName.toLowerCase()}s', async (req, res) => {
    try {
      const ${modelName.toLowerCase()}s = await prisma.${modelName.toLowerCase()}.findMany();
      res.json(${modelName.toLowerCase()}s);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ${modelName.toLowerCase()}s' });
    }
  });
  
  // GET single ${modelName.toLowerCase()}
  router.get('/${modelName.toLowerCase()}s/:id', async (req, res) => {
    try {
      const ${modelName.toLowerCase()} = await prisma.${modelName.toLowerCase()}.findUnique({
        where: { id: req.params.id }
      });
      if (!${modelName.toLowerCase()}) {
        return res.status(404).json({ error: '${modelName} not found' });
      }
      res.json(${modelName.toLowerCase()});
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch ${modelName.toLowerCase()}' });
    }
  });
  
  // POST create ${modelName.toLowerCase()}
  router.post('/${modelName.toLowerCase()}s', async (req, res) => {
    try {
      const { ${fields.join(", ")} } = req.body;
      const new${modelName} = await prisma.${modelName.toLowerCase()}.create({
        data: {
          ${fields.map((field: string) => `${field}`).join(",\n        ")}
        }
      });
      res.status(201).json(new${modelName});
    } catch (error) {
      res.status(400).json({ error: 'Failed to create ${modelName.toLowerCase()}' });
    }
  });
  
  // PUT update ${modelName.toLowerCase()}
  router.put('/${modelName.toLowerCase()}s/:id', async (req, res) => {
    try {
      const { ${fields.join(", ")} } = req.body;
      const updated${modelName} = await prisma.${modelName.toLowerCase()}.update({
        where: { id: req.params.id },
        data: {
          ${fields.map((field: string) => `${field}`).join(",\n        ")}
        }
      });
      res.json(updated${modelName});
    } catch (error) {
      res.status(400).json({ error: 'Failed to update ${modelName.toLowerCase()}' });
    }
  });
  
  // DELETE ${modelName.toLowerCase()}
  router.delete('/${modelName.toLowerCase()}s/:id', async (req, res) => {
    try {
      await prisma.${modelName.toLowerCase()}.delete({
        where: { id: req.params.id }
      });
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: 'Failed to delete ${modelName.toLowerCase()}' });
    }
  });
  
  module.exports = router;
  
  // Prisma Schema
  /*
  model ${modelName} {
  ${fields.map((field: string) => `  ${field} String${field === "id" ? " @id @default(cuid())" : ""}`).join("\n")}
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
  }
  */
  </artifact>
  
  // Database configuration
  const dbConfig = {
    host: 'localhost',
    port: 5432,
    database: '${modelName.toLowerCase()}_db',
    username: 'postgres',
    password: 'password'
  };
  
  // Validation middleware
  const validate${modelName} = (req, res, next) => {
    const { ${fields.join(", ")} } = req.body;
    
    ${fields
      .map(
        (field: string) => `
    if (!${field} && ${field} !== 0) {
      return res.status(400).json({ error: '${field} is required' });
    }`
      )
      .join("")}
    
    next();
  };
  
  // Export the router
  module.exports = { router, validate${modelName}, dbConfig };
  `.trim();
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
