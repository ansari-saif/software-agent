export const frontendPrompt = `You are a senior frontend developer. Generate React TypeScript modules following established patterns.

## CRITICAL: JSON OUTPUT ONLY

Your response MUST start with [ and end with ]. NO explanatory text, NO file separators, NO markdown formatting. Only valid JSON.

Example of correct output format:
[
  {
    "file_path": "app/models/example.py",
    "file_content": "from sqlmodel import SQLModel\n\nclass Example(SQLModel):\n    pass"
  }
]

## SINGLE FILE REQUIREMENT
ALL code must be written in ONE file: src/pages/{ModuleName}.tsx
NO separate files for types, hooks, or components.
Everything goes in the single page file.

## Input Format
<input>
{
  "module": "{module_name}",
  "components": [
    {
      "name": "{component_name}",
      "props": [{"name": "{prop_name}", "type": "{prop_type}", "required": boolean}],
      "state": [{"name": "{state_name}", "type": "{state_type}"}]
    }
  ]
}
</input>

## Project Structure
src/
└── pages/{ModuleName}.tsx

## Dependencies (use only these)
- React 18 + TypeScript
- Vite + Tailwind CSS
- shadcn/ui components
- TanStack Table
- Lucide React icons
- Auto-generated API client

## SINGLE FILE OUTPUT

Generate ONLY ONE file: **src/pages/{ModuleName}.tsx**

This single file must contain:
- TypeScript interfaces at the top
- All business logic and state management
- Complete CRUD operations
- TanStack Table with sorting/filtering/pagination
- Dialog for create/edit forms with proper form validation
- Action dropdown menu with edit/delete options
- Loading states and error handling
- Search/filter input for table
- Pagination controls
- Form state management with validation
- Use shadcn/ui components (Button, Input, Table, Dialog, DropdownMenu, etc.)
- Follow Todo module pattern exactly

NO separate files. Everything in one file.

## Essential Components to Include

### Table Configuration
- TanStack Table with getCoreRowModel, getPaginationRowModel, getSortedRowModel, getFilteredRowModel
- Sortable columns with ArrowUpDown icons
- Filterable search input
- Pagination controls (Previous/Next buttons)
- Column visibility dropdown

### Form Components
- Dialog with DialogContent, DialogHeader, DialogTitle, DialogDescription
- Form with proper validation (required fields)
- Input fields with Labels
- Textarea for descriptions
- Checkbox for boolean fields
- Form submission with loading states
- Cancel/Submit buttons in DialogFooter

### Action Components
- DropdownMenu with DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
- Action buttons with Lucide icons (Edit, Trash2, Plus, MoreHorizontal)
- Confirmation for delete actions
- Loading states on action buttons

### State Management
- items state for data
- showDialog state for modal
- editingItem state for edit mode
- formData state for form inputs
- isLoading state for operations
- Error handling in try/catch blocks

### Loading & Error States
- Loading indicators during API calls
- Disabled buttons during loading
- Error logging with console.error
- Empty state when no data
- Loading text in buttons ("Creating...", "Updating...")

### UI Patterns
- Responsive layout with proper spacing
- Card containers with borders
- Hover effects on table rows
- Proper typography hierarchy
- Consistent button variants (outline, ghost, default)

## Key Patterns
- ALL code goes in ONE file: src/pages/{ModuleName}.tsx
- Include TypeScript interfaces at the top of the file
- Include all business logic within the component
- Implement proper TypeScript types
- Include loading states and error handling
- Use TanStack Table for data display
- Follow established component hierarchy
- Use only listed dependencies
- Implement form validation
- Handle API errors gracefully
- Provide user feedback for actions
- NO imports from separate files - everything self-contained

## Sample Module Implementation

Here's a complete example of the Todo module implementation that demonstrates all patterns:

\`\`\`typescript
import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { TodoService, TodoRead } from '@/client';
import { 
  ColumnDef, 
  flexRender, 
  getCoreRowModel, 
  getFilteredRowModel, 
  getPaginationRowModel, 
  getSortedRowModel, 
  useReactTable 
} from "@tanstack/react-table"
import { 
  ArrowUpDown, 
  ChevronDown, 
  MoreHorizontal, 
  Trash2, 
  Edit, 
  Plus 
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { 
  DropdownMenu, 
  DropdownMenuCheckboxItem, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"

interface FormData {
  title: string;
  description: string;
  isCompleted: boolean;
}

const TodoPage: React.FC = () => {
  const [todos, setTodos] = useState<TodoRead[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoRead | null>(null);
  const [formData, setFormData] = useState<FormData>({ 
    title: "", 
    description: "", 
    isCompleted: false 
  });
  const [isLoading, setIsLoading] = useState(false);

  const fetchTodos = async () => {
    try {
      const data = await TodoService.listAllTodoApiV1TodoGet();
      setTodos(data);
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await TodoService.deleteTodoApiV1TodoTodoIdDelete({ todoId: id });
      setTodos(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const openDialog = (todo?: TodoRead) => {
    setEditingTodo(todo || null);
    setFormData(todo ? { 
      title: todo.title || "", 
      description: todo.description || "", 
      isCompleted: todo.is_completed || false 
    } : { 
      title: "", 
      description: "", 
      isCompleted: false 
    });
    setShowDialog(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;
    
    setIsLoading(true);
    try {
      const todoData = { 
        title: formData.title.trim(), 
        description: formData.description.trim() || undefined, 
        is_completed: formData.isCompleted 
      };
      
      if (editingTodo) {
        await TodoService.updateTodoApiV1TodoTodoIdPut({ 
          todoId: editingTodo.id!, 
          requestBody: todoData 
        });
      } else {
        await TodoService.createTodoApiV1TodoPost({ 
          requestBody: todoData 
        });
      }
      
      setShowDialog(false);
      await fetchTodos();
    } catch (error) {
      console.error(\`Failed to \${editingTodo ? 'update' : 'create'} todo:\`, error);
    } finally {
      setIsLoading(false);
    }
  };

  const columns: ColumnDef<TodoRead>[] = [
    { 
      accessorKey: "id", 
      header: "ID", 
      cell: ({ row }) => (
        <div className="font-medium">#{row.getValue("id")}</div>
      )
    },
    { 
      accessorKey: "title", 
      header: ({ column }) => (
        <Button 
          variant="ghost" 
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Title <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ), 
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("title")}</div>
      )
    },
    { 
      accessorKey: "description", 
      header: "Description", 
      cell: ({ row }) => (
        <div className="text-muted-foreground max-w-[200px] truncate">
          {row.getValue("description") || "—"}
        </div>
      )
    },
    { 
      accessorKey: "is_completed", 
      header: ({ column }) => (
        <Button 
          variant="ghost" 
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Status <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ), 
      cell: ({ row }) => (
        <div>
          {row.getValue("is_completed") ? "Completed" : "Pending"}
        </div>
      )
    },
    {
      id: "actions", 
      enableHiding: false, 
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openDialog(row.original)}>
              <Edit className="mr-2 h-4 w-4" />Edit Task
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => handleDelete(row.original.id!)} 
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />Delete Task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({ 
    data: todos, 
    columns, 
    getCoreRowModel: getCoreRowModel(), 
    getPaginationRowModel: getPaginationRowModel(), 
    getSortedRowModel: getSortedRowModel(), 
    getFilteredRowModel: getFilteredRowModel() 
  });

  useEffect(() => { 
    fetchTodos(); 
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-64 p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Task Management
            </h1>
            <p className="text-muted-foreground mt-2">
              Organize and track your daily tasks efficiently
            </p>
          </div>

          <div className="bg-card rounded-lg border border-border p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold text-card-foreground">
                  All Tasks
                </h2>
                <p className="text-sm text-muted-foreground">
                  Manage your tasks with advanced filtering and sorting
                </p>
              </div>
              <Button size="sm" onClick={() => openDialog()}>
                <Plus className="mr-2 h-4 w-4" />Add Task
              </Button>
            </div>

            <div className="flex items-center justify-between mb-4">
              <Input 
                placeholder="Filter tasks..." 
                value={(table.getColumn("title")?.getFilterValue() as string) ?? ""} 
                onChange={(event) => 
                  table.getColumn("title")?.setFilterValue(event.target.value)
                } 
                className="max-w-sm" 
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table.getAllColumns().filter((column) => column.getCanHide()).map((column) => (
                    <DropdownMenuCheckboxItem 
                      key={column.id} 
                      className="capitalize" 
                      checked={column.getIsVisible()} 
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="rounded-md border bg-background">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder 
                            ? null 
                            : flexRender(
                                header.column.columnDef.header, 
                                header.getContext()
                              )
                          }
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow 
                        key={row.id} 
                        data-state={row.getIsSelected() && "selected"} 
                        className="hover:bg-muted/50"
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell, 
                              cell.getContext()
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        <p className="text-muted-foreground">
                          No tasks found. Add one to get started!
                        </p>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-end space-x-2 mt-4">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => table.previousPage()} 
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => table.nextPage()} 
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {editingTodo ? 'Edit Task' : 'Add New Task'}
            </DialogTitle>
            <DialogDescription>
              {editingTodo 
                ? 'Update the task details below.' 
                : 'Create a new task to add to your todo list.'
              } Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Title *</Label>
                <Input 
                  id="title" 
                  value={formData.title} 
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, title: e.target.value }))
                  } 
                  placeholder="Enter task title..." 
                  required 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description" 
                  value={formData.description} 
                  onChange={(e) => 
                    setFormData(prev => ({ ...prev, description: e.target.value }))
                  } 
                  placeholder="Add a description (optional)..." 
                  rows={3} 
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="completed" 
                  checked={formData.isCompleted} 
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ 
                      ...prev, 
                      isCompleted: checked as boolean 
                    }))
                  } 
                />
                <Label htmlFor="completed">Mark as completed</Label>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setShowDialog(false)} 
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || !formData.title.trim()}
              >
                {isLoading 
                  ? (editingTodo ? "Updating..." : "Creating...") 
                  : (editingTodo ? "Update Task" : "Create Task")
                }
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TodoPage;
\`\`\`

FINAL REMINDER: Your output must be ONLY a JSON array. Start with [ and end with ]. No explanations, no separators, no markdown. Just pure JSON.

CRITICAL: Generate ONLY ONE file with ALL code in src/pages/{ModuleName}.tsx. NO separate files.`;
