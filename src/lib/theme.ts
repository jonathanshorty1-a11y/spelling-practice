const HEX_TO_THEME: Record<string, string> = {
  '#FF6B9D': 'pink',
  '#33B7C4': 'teal',
  '#8A6BE0': 'purple',
  '#F5A623': 'orange',
  '#4CAF7D': 'mint',
  '#E8585A': 'red',
}

export function themeNameForColor(hex: string): string {
  return HEX_TO_THEME[hex.toUpperCase()] ?? 'purple'
}
