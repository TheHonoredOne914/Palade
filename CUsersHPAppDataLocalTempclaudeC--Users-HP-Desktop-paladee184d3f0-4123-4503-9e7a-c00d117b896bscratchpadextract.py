import os
import re
import json
from pathlib import Path

repo_root = "C:\Users\HP\Desktop\palade"
src_root = os.path.join(repo_root, "src")

files_list = [
    "src/agents/base.ts",
    "src/agents/combined.ts",
    "src/agents/custom/agent.ts",
    "src/agents/custom/loader.ts",
    "src/agents/custom/schema.ts",
    "src/agents/registry.ts",
    "src/agents/skills.ts",
    "src/agents/specialist/architecture.ts",
    "src/agents/specialist/deadCode.ts",
    "src/agents/specialist/logic.ts",
    "src/agents/specialist/maintainability.ts",
    "src/agents/specialist/performance.ts",
    "src/agents/specialist/pragmatism.ts",
    "src/agents/specialist/security.ts",
    "src/agents/specialist/testIntelligence.ts",
    "src/agents/synthesis.ts",
    "src/cli/commands/decisions.ts",
    "src/cli/commands/diff.ts",
    "src/cli/commands/init.ts",
    "src/cli/commands/review.ts",
    "src/cli/commands/score.ts",
    "src/cli/commands/settings.ts",
    "src/cli/commands/targets.ts",
    "src/cli/commands/watch.ts",
    "src/cli/index.ts",
    "src/cli/picker.ts",
    "src/config/apiKey.ts",
    "src/config/defaults.ts",
    "src/config/loader.ts",
    "src/config/models.ts",
    "src/config/schema.ts",
    "src/diff/comparator.ts",
    "src/diff/git.ts",
    "src/diff/types.ts",
    "src/errors/handler.ts",
    "src/errors/types.ts",
    "src/ingestion/annotationParser.ts",
    "src/ingestion/chunker.ts",
    "src/ingestion/contextPacks.ts",
    "src/ingestion/dependencyTracer.ts",
    "src/ingestion/estimator.ts",
    "src/ingestion/keywordIndex.ts",
    "src/ingestion/symbolResolver.ts",
    "src/ingestion/types.ts",
    "src/ingestion/walker.ts",
    "src/modes/debt.ts",
    "src/modes/ghost.ts",
    "src/modes/index.ts",
    "src/modes/onboard.ts",
    "src/modes/security.ts",
    "src/orchestrator/findingValidation.ts",
    "src/orchestrator/memory.ts",
    "src/orchestrator/merger.ts",
    "src/orchestrator/pipeline.ts",
    "src/orchestrator/scheduler.ts",
    "src/orchestrator/swarm.ts",
    "src/orchestrator/triage.ts",
    "src/orchestrator/types.ts",
    "src/orchestrator/verdict.ts",
    "src/providers/base.ts",
    "src/providers/cerebras.ts",
    "src/providers/groq.ts",
    "src/providers/nvidia.ts",
    "src/providers/ollama.ts",
    "src/providers/opencode-zen.ts",
    "src/providers/openrouter.ts",
    "src/providers/pool.ts",
    "src/providers/router.ts",
    "src/reporters/html.ts",
    "src/reporters/index.ts",
    "src/reporters/json.ts",
    "src/reporters/markdown.ts",
    "src/reporters/terminal.ts",
    "src/reporters/types.ts",
    "src/scorer/badge.ts",
    "src/scorer/calculator.ts",
    "src/scorer/history.ts",
    "src/scorer/types.ts",
    "src/targets/generator.ts",
    "src/targets/loader.ts",
    "src/targets/registry.ts",
    "src/targets/schema.ts",
    "src/tui/commands/registry.ts",
    "src/tui/hooks/useCommandHistory.ts",
    "src/tui/hooks/useCommandRunner.ts",
    "src/tui/hooks/useOutputStream.ts",
    "src/tui/outputAdapter.ts",
    "src/ui/asciiArt.ts",
    "src/ui/banner.ts",
    "src/ui/layout.ts",
    "src/ui/progress.ts",
    "src/ui/prompt.ts",
    "src/ui/theme.ts",
    "src/utils/sanitize.ts",
    "src/tui/app.tsx",
    "src/tui/components/Autocomplete.tsx",
    "src/tui/components/CommandInput.tsx",
    "src/tui/components/Header.tsx",
    "src/tui/components/OutputPane.tsx",
    "src/tui/components/SettingsPanel.tsx",
    "src/tui/launch.tsx",
]

def extract_exports(file_path):
    """Extract all export names from a TypeScript file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return []
    
    exports = []
    
    # Pattern 1: export function/class/interface/type/const NAME
    pattern1 = r'^export\s+(?:async\s+)?(?:function|class|interface|type|const|enum|default)\s+(\w+)'
    matches = re.findall(pattern1, content, re.MULTILINE)
    exports.extend(matches)
    
    # Pattern 2: export { ... }  - re-exports
    pattern2 = r'^export\s*\{([^}]+)\}'
    match = re.search(pattern2, content, re.MULTILINE | re.DOTALL)
    if match:
        items = match.group(1)
        for item in items.split(','):
            item = item.strip()
            # Handle "name as alias" or just "name" or "type { ... }"
            if 'as' in item:
                parts = item.split('as')
                exports.append(parts[-1].strip())
            elif item and not item.startswith('type'):
                exports.append(item.split()[0].strip())
            elif item.startswith('type'):
                # Handle "type { Name1, Name2 }" format
                type_content = item[4:].strip()
                if type_content.startswith('{'):
                    type_items = type_content[1:-1].split(',')
                    for ti in type_items:
                        ti = ti.strip()
                        if ti:
                            name = ti.split('as')[-1].strip()
                            exports.append(name)
    
    # Remove duplicates, keep order
    seen = set()
    unique_exports = []
    for e in exports:
        if e and e not in seen:
            seen.add(e)
            unique_exports.append(e)
    
    return unique_exports

def count_lines(file_path):
    """Count non-empty lines in file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return len(f.readlines())
    except:
        return 0

result = {"files": []}

for rel_path in files_list:
    full_path = os.path.join(repo_root, rel_path)
    if os.path.exists(full_path):
        loc = count_lines(full_path)
        exports = extract_exports(full_path)
        result["files"].append({
            "path": rel_path,
            "loc": loc,
            "exports": exports
        })

print(json.dumps(result, indent=2))
