# Cline Instructions for cloum

## Project Overview
This is a CLI tool for managing Kubernetes cluster connections across GCP, AWS, and Azure.

## Important Patterns

### Version Management
- Version is stored in TWO places that MUST be kept in sync:
  1. `src/commands/version.ts` - `export const VERSION = "x.y.z";`
  2. `package.json` - `"version": "x.y.z"`

### Making Changes & Release Process

**Manual Release:**
1. Make your code changes
2. Update BOTH version.ts and package.json to the new version
3. Commit with a descriptive message
4. Tag the commit with `git tag v<version>` 
5. Push: `git push origin master --tags`

**Automatic Release (recommended):**
1. Just push to master
2. The bump-version workflow automatically:
   - Increments patch version
   - Updates both version.ts and package.json
   - Creates a git tag
3. The release workflow triggers on tag push and builds binaries

### Workflows
- **bump-version.yml**: Runs on branch push, auto-bumps version and creates tag
- **release.yml**: Runs on tag push, builds binaries and creates GitHub Release

### Testing Before Release
```bash
bun run typecheck
bun run src/index.ts --version
```
