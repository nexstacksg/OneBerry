export class SelectionManager {
  private selectedIds = new Set<string>();

  getSelection(): string[] {
    return Array.from(this.selectedIds);
  }

  clear(): void {
    this.selectedIds.clear();
  }

  selectOnly(id: string): string[] {
    this.selectedIds = new Set([id]);
    return this.getSelection();
  }

  toggle(id: string): string[] {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id);
    else this.selectedIds.add(id);
    return this.getSelection();
  }

  extend(id: string): string[] {
    this.selectedIds.add(id);
    return this.getSelection();
  }
}
