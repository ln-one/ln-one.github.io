/** Display text recovered from the renderer's `Qc` basename helper. */
export function graphViewBasename(value: string): string {
  const basename = value.slice(value.lastIndexOf('/') + 1);
  return basename;
}

/**
 * The renderer only applies `Qc` to Markdown ids. Other node kinds (notably
 * attachments) keep their full filename even though the basename is still
 * used when a path contains folders.
 */
export function graphViewDisplayText(value: string, stripExtension = true): string {
  const basename = graphViewBasename(value);
  if (!stripExtension || !isGraphViewMarkdownPath(value)) return basename;
  const extensionIndex = basename.lastIndexOf('.');
  if (extensionIndex === -1 || extensionIndex === 0 || extensionIndex === basename.length - 1) {
    return basename;
  }
  return basename.slice(0, extensionIndex);
}

export function isGraphViewMarkdownPath(value: string): boolean {
  const basename = graphViewBasename(value);
  const extensionIndex = basename.lastIndexOf('.');
  return extensionIndex > 0 && basename.slice(extensionIndex + 1).toLowerCase() === 'md';
}
