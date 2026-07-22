import type { LayoutCommand, LayoutTile } from './types.ts';

export class HistoryManager {
  private undoStack: LayoutCommand[] = [];
  private redoStack: LayoutCommand[] = [];

  execute(command: LayoutCommand): LayoutTile[] {
    const next = command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
    return next;
  }

  undo(): LayoutTile[] | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    this.redoStack.push(command);
    return command.undo();
  }

  redo(): LayoutTile[] | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    this.undoStack.push(command);
    return command.execute();
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
