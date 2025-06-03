"use client";

import React from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';

interface Field {
  name: string;
  type?: string;
  ref?: string;
}

interface Module {
  module: string;
  fields: Field[];
}

interface SchemaViewerProps {
  schema: Module[];
}

export default function SchemaViewer({ schema }: SchemaViewerProps) {
  const [expandedModules, setExpandedModules] = React.useState<string[]>([]);
  const didInit = React.useRef(false);

  React.useEffect(() => {
    if (!didInit.current) {
      setExpandedModules(schema.map((mod) => mod.module));
      didInit.current = true;
    }
    // else, do not auto-expand on subsequent schema changes
  }, [schema]);

  const toggleModule = (moduleName: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleName)
        ? prev.filter(m => m !== moduleName)
        : [...prev, moduleName]
    );
  };

  const getFieldTypeColor = (type: string) => {
    switch (type) {
      case 'string':
        return 'text-emerald-400';
      case 'number':
      case 'integer':
        return 'text-blue-400';
      case 'date':
      case 'time':
        return 'text-purple-400';
      case 'boolean':
        return 'text-yellow-400';
      case 'json':
        return 'text-orange-400';
      case 'text':
        return 'text-teal-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="w-full p-6 bg-gray-900">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <Database className="w-6 h-6 text-blue-400" />
          <h1 className="text-2xl font-bold text-white">Database Schema</h1>
        </div>
        
        <div className="grid gap-4">
          {schema.map((module) => (
            <div
              key={module.module}
              className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <button
                onClick={() => toggleModule(module.module)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-750"
              >
                <div className="flex items-center gap-2">
                  {expandedModules.includes(module.module) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <span className="text-lg font-medium text-white capitalize">
                    {module.module}
                  </span>
                  <span className="text-sm text-gray-400">
                    ({module.fields.length} fields)
                  </span>
                </div>
              </button>
              
              {/* Collapsible content with smooth height transition */}
              <div
                className="px-4 transition-all duration-300 overflow-hidden"
                style={{
                  maxHeight: expandedModules.includes(module.module) ? 1000 : 0,
                  paddingBottom: expandedModules.includes(module.module) ? 16 : 0,
                }}
              >
                {expandedModules.includes(module.module) && (
                  <div className="space-y-2">
                    {module.fields.map((field) => (
                      <div
                        key={field.name}
                        className="flex items-center justify-between py-2 px-4 bg-gray-750 rounded-md"
                      >
                        <span className="text-white font-medium">
                          {field.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {field.ref && (
                            <span className="text-sm text-blue-400">
                              → {field.ref}
                            </span>
                          )}
                          <span className={`text-sm ${getFieldTypeColor(field.type || 'string')}`}>
                            {field.type || 'string'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 