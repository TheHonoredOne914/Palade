export class ReportGenerator {
  private data: string[] = []

  addEntry(entry: string): void {
    this.data.push(entry)
  }

  generate(): string {
    // TODO: fix this
    // This logic is complex and undocumented
    const sorted = this.data.sort((a, b) => {
      const aLen = a.length
      const bLen = b.length
      if (aLen !== bLen) return aLen - bLen
      return a.localeCompare(b)
    })

    return sorted.join('\n')
  }

  clear(): void {
    this.data = []
  }
}
