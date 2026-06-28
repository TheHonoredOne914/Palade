import { loadConfig } from './src/config/loader.js';
import { initRouter } from './src/providers/router.js';
import { ArchitectureAgent } from './src/agents/specialist/architecture.js';
import { walkProject } from './src/ingestion/walker.js';
import { chunkFiles } from './src/ingestion/chunker.js';

async function testWatch() {
  const config = await loadConfig();
  await initRouter(config);
  
  const scope = { projectRoot: process.cwd(), files: ['src/cli/index.ts'] };
  const manifests = await walkProject(process.cwd(), scope);
  const chunks = await chunkFiles(manifests);
  
  const context = {
    projectLanguages: [manifests[0].language],
    totalFiles: 1,
    totalChunks: chunks.length,
    mode: 'standard' as const,
  };
  
  const agent = new ArchitectureAgent();
  try {
    const findings = await agent.analyze(chunks, context);
    console.log('Findings:', findings);
  } catch (err) {
    console.error('Error during analysis:', err);
  }
}

testWatch().catch(console.error);
