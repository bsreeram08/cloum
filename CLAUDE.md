# Cline Instructions for cloum

## Project Overview

This is a CLI tool for managing Kubernetes cluster connections across GCP, AWS, and Azure.

## Important Patterns

### Version Management

- Version is stored in TWO places that MUST be kept in sync:
  1. `src/commands/version.ts` - `export const VERSION = "x.y.z";`
  2. `package.json` - `"version": "x.y.z"`

### Release Process (Manual)

1. Make your code changes
2. Update BOTH version.ts and package.json to the new version
3. Commit with a descriptive message
4. Tag the commit: `git tag v<version>`
5. Push: `git push origin master --tags`

Example:

```bash
# Update version in both files
git add -A
git commit -m "Description of changes"
git tag v1.1.2
git push origin master --tags
```

### Testing Before Release

```bash
bun run typecheck
bun run src/index.ts --version
```
