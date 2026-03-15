"use client";

import { useState } from "react";
import { Button } from "@atlas/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@atlas/ui";
import Link from "next/link";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

type Filter = "all" | "active" | "completed";

export default function TodoPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  function addTodo() {
    const text = input.trim();
    if (!text) return;
    setTodos((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, completed: false },
    ]);
    setInput("");
  }

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
    );
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function startEditing(todo: Todo) {
    setEditingId(todo.id);
    setEditText(todo.text);
  }

  function saveEdit(id: string) {
    const text = editText.trim();
    if (!text) return;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, text } : t)),
    );
    setEditingId(null);
    setEditText("");
  }

  function clearCompleted() {
    setTodos((prev) => prev.filter((t) => !t.completed));
  }

  const filteredTodos = todos.filter((t) => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;

  return (
    <div
      data-theme="explore"
      className="h-full overflow-auto bg-background text-foreground"
    >
      <div className="max-w-xl mx-auto px-6 py-16">
        <header className="mb-8">
          <Link
            href="/"
            className="text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Back to Atlas
          </Link>
          <h1 className="text-3xl font-bold tracking-tight mt-4 mb-2">
            Todo
          </h1>
          <p className="text-muted-foreground">
            Keep track of what needs to be done.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="sr-only">Add a todo</CardTitle>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addTodo();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="What needs to be done?"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-body placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <Button type="submit" size="default">
                Add
              </Button>
            </form>
          </CardHeader>

          <CardContent>
            {todos.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No todos yet. Add one above!
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {filteredTodos.map((todo) => (
                    <li
                      key={todo.id}
                      className="flex items-center gap-3 py-3 group"
                    >
                      <button
                        onClick={() => toggleTodo(todo.id)}
                        className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          todo.completed
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-input hover:border-primary/50"
                        }`}
                        aria-label={
                          todo.completed
                            ? "Mark as incomplete"
                            : "Mark as complete"
                        }
                      >
                        {todo.completed && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 6L5 8.5L9.5 3.5" />
                          </svg>
                        )}
                      </button>

                      {editingId === todo.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveEdit(todo.id);
                          }}
                          className="flex-1 flex gap-2"
                        >
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-body focus:outline-none focus:ring-1 focus:ring-ring"
                            autoFocus
                            onBlur={() => saveEdit(todo.id)}
                          />
                        </form>
                      ) : (
                        <span
                          onDoubleClick={() => startEditing(todo)}
                          className={`flex-1 text-body cursor-default ${
                            todo.completed
                              ? "line-through text-muted-foreground"
                              : ""
                          }`}
                          title="Double-click to edit"
                        >
                          {todo.text}
                        </span>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteTodo(todo.id)}
                        aria-label="Delete todo"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        >
                          <path d="M3 3L11 11M11 3L3 11" />
                        </svg>
                      </Button>
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between pt-4 mt-4 border-t border-border">
                  <span className="text-caption text-muted-foreground">
                    {activeCount} item{activeCount !== 1 ? "s" : ""} left
                  </span>

                  <div className="flex gap-1">
                    {(["all", "active", "completed"] as Filter[]).map((f) => (
                      <Button
                        key={f}
                        variant={filter === f ? "secondary" : "ghost"}
                        size="sm"
                        onClick={() => setFilter(f)}
                        className="capitalize"
                      >
                        {f}
                      </Button>
                    ))}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearCompleted}
                    className="text-muted-foreground"
                    disabled={todos.every((t) => !t.completed)}
                  >
                    Clear done
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
