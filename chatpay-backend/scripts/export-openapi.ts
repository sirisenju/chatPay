import fs from 'fs';
import path from 'path';
import { buildApp } from '../src/app.js';

async function exportOpenApi() {
  const app = await buildApp();
  await app.ready();

  const openapiObject = app.swagger();
  const outputPath = path.resolve(process.cwd(), 'openapi.json');

  fs.writeFileSync(outputPath, JSON.stringify(openapiObject, null, 2), 'utf8');
  console.log(`✅ OpenAPI 3.1 specification exported successfully to: ${outputPath}`);

  await app.close();
  process.exit(0);
}

exportOpenApi().catch((err) => {
  console.error('Failed to export OpenAPI specification:', err);
  process.exit(1);
});
