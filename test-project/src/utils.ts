export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

// @palade review: unused code — should be removed
export function unusedHelper(): void {
  console.log('This function is never called')
}

export function parseQueryString(qs: string): Record<string, string> {
  const params = new URLSearchParams(qs)
  const result: Record<string, string> = {}
  params.forEach((value, key) => {
    result[key] = value
  })
  return result
}
