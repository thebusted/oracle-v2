/**
 * Oracle v2 - Fill Missing Index
 *
 * Incrementally index only files that are missing from the database.
 * Safe to run anytime - doesn't delete existing data.
 *
 * Usage:
 *   ORACLE_REPO_ROOT=/oracle bun run src/fill-missing-index.ts
 *   ORACLE_REPO_ROOT=/oracle bun run src/fill-missing-index.ts --dry-run
 */

import fs from 'fs';
import path from 'path';
import { Database } from 'bun:sqlite';
import { ChromaMcpClient } from './chroma-mcp.js';
import { detectProject } from './server/project-detect.js';
import type { OracleDocument, IndexerConfig } from './types.js';

// ============================================
// Configuration
// ============================================

const homeDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
const repoRoot = process.env.ORACLE_REPO_ROOT || process.cwd();
const oracleDataDir = process.env.ORACLE_DATA_DIR || path.join(homeDir, '.oracle-v2');

const config: IndexerConfig = {
  repoRoot,
  dbPath: process.env.ORACLE_DB_PATH || path.join(oracleDataDir, 'oracle.db'),
  vectorPath: path.join(homeDir, '.chromadb'),
  sourcePaths: {
    resonance: 'ψ/memory/resonance',
    learnings: 'ψ/memory/learnings',
    retrospectives: 'ψ/memory/retrospectives'
  }
};

const isDryRun = process.argv.includes('--dry-run');

// ============================================
// Helper Functions
// ============================================

function getAllMarkdownFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllMarkdownFiles(fullPath));
    } else if (item.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getRelativePath(fullPath: string, repoRoot: string): string {
  return path.relative(repoRoot, fullPath);
}

function parseFrontmatterTags(content: string): string[] {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return [];

  const frontmatter = frontmatterMatch[1];
  const tagsMatch = frontmatter.match(/^tags:\s*\[?([^\]\n]+)\]?/m);
  if (!tagsMatch) return [];

  return tagsMatch[1]
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);
}

function extractConcepts(...texts: string[]): string[] {
  const combined = texts.join(' ').toLowerCase();
  const concepts = new Set<string>();

  const keywords = [
    'trust', 'pattern', 'mirror', 'append', 'history', 'context',
    'delete', 'behavior', 'intention', 'decision', 'human', 'external',
    'brain', 'command', 'oracle', 'timestamp', 'immutable', 'preserve',
    'learn', 'memory', 'session', 'workflow', 'api', 'mcp', 'claude',
    'git', 'code', 'file', 'config', 'test', 'debug', 'error', 'fix',
    'feature', 'refactor', 'style', 'docs', 'plan', 'task', 'issue'
  ];

  for (const keyword of keywords) {
    if (combined.includes(keyword)) {
      concepts.add(keyword);
    }
  }

  return Array.from(concepts);
}

function mergeConceptsWithTags(extracted: string[], fileTags: string[]): string[] {
  return [...new Set([...extracted, ...fileTags])];
}

// ============================================
// Parsers (same logic as indexer.ts)
// ============================================

function parseLearningFile(filename: string, content: string): OracleDocument[] {
  const documents: OracleDocument[] = [];
  const sourceFile = `ψ/memory/learnings/${filename}`;
  const now = Date.now();

  const fileTags = parseFrontmatterTags(content);
  const titleMatch = content.match(/^title:\s*(.+)$/m);
  const title = titleMatch ? titleMatch[1] : filename.replace('.md', '');

  const sections = content.split(/^##\s+/m).filter(s => s.trim());

  sections.forEach((section, index) => {
    const lines = section.split('\n');
    const sectionTitle = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body) return;

    const id = `learning_${filename.replace('.md', '')}_${index}`;
    const extractedConcepts = extractConcepts(sectionTitle, body);
    documents.push({
      id,
      type: 'learning',
      source_file: sourceFile,
      content: `${title} - ${sectionTitle}: ${body}`,
      concepts: mergeConceptsWithTags(extractedConcepts, fileTags),
      created_at: now,
      updated_at: now
    });
  });

  if (documents.length === 0) {
    const extractedConcepts = extractConcepts(title, content);
    documents.push({
      id: `learning_${filename.replace('.md', '')}`,
      type: 'learning',
      source_file: sourceFile,
      content: content,
      concepts: mergeConceptsWithTags(extractedConcepts, fileTags),
      created_at: now,
      updated_at: now
    });
  }

  return documents;
}

function parseRetroFile(relativePath: string, content: string): OracleDocument[] {
  const documents: OracleDocument[] = [];
  const now = Date.now();

  const fileTags = parseFrontmatterTags(content);
  const sections = content.split(/^##\s+/m).filter(s => s.trim());

  sections.forEach((section, index) => {
    const lines = section.split('\n');
    const sectionTitle = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body || body.length < 50) return;

    const filename = path.basename(relativePath, '.md');
    const id = `retro_${filename}_${index}`;
    const extractedConcepts = extractConcepts(sectionTitle, body);

    documents.push({
      id,
      type: 'retro',
      source_file: relativePath,
      content: `${sectionTitle}: ${body}`,
      concepts: mergeConceptsWithTags(extractedConcepts, fileTags),
      created_at: now,
      updated_at: now
    });
  });

  return documents;
}

function parseResonanceFile(filename: string, content: string): OracleDocument[] {
  const documents: OracleDocument[] = [];
  const sourceFile = `ψ/memory/resonance/${filename}`;
  const now = Date.now();

  const fileTags = parseFrontmatterTags(content);
  const sections = content.split(/^###\s+/m).filter(s => s.trim());

  sections.forEach((section, index) => {
    const lines = section.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body) return;

    const id = `resonance_${filename.replace('.md', '')}_${index}`;
    const extractedConcepts = extractConcepts(title, body);
    documents.push({
      id,
      type: 'principle',
      source_file: sourceFile,
      content: `${title}: ${body}`,
      concepts: mergeConceptsWithTags(extractedConcepts, fileTags),
      created_at: now,
      updated_at: now
    });
  });

  return documents;
}

// ============================================
// Main Logic
// ============================================

async function main() {
  console.log('🔍 Oracle Fill Missing Index');
  console.log(`📁 Repo Root: ${repoRoot}`);
  console.log(`🗄️  Database: ${config.dbPath}`);
  if (isDryRun) console.log('🧪 DRY RUN MODE - no changes will be made\n');

  const db = new Database(config.dbPath);
  const project = detectProject(repoRoot);

  // Get all indexed source files from DB
  const indexedFiles = new Set<string>(
    (db.prepare('SELECT DISTINCT source_file FROM oracle_documents').all() as any[])
      .map(row => row.source_file)
  );

  console.log(`📊 Currently indexed: ${indexedFiles.size} unique source files\n`);

  // Find all files on disk
  const diskFiles: { path: string; relativePath: string; type: 'resonance' | 'learning' | 'retro' }[] = [];

  // Resonance
  const resonancePath = path.join(repoRoot, config.sourcePaths.resonance);
  if (fs.existsSync(resonancePath)) {
    fs.readdirSync(resonancePath)
      .filter(f => f.endsWith('.md'))
      .forEach(f => {
        diskFiles.push({
          path: path.join(resonancePath, f),
          relativePath: `ψ/memory/resonance/${f}`,
          type: 'resonance'
        });
      });
  }

  // Learnings
  const learningsPath = path.join(repoRoot, config.sourcePaths.learnings);
  if (fs.existsSync(learningsPath)) {
    fs.readdirSync(learningsPath)
      .filter(f => f.endsWith('.md'))
      .forEach(f => {
        diskFiles.push({
          path: path.join(learningsPath, f),
          relativePath: `ψ/memory/learnings/${f}`,
          type: 'learning'
        });
      });
  }

  // Retrospectives (recursive)
  const retroPath = path.join(repoRoot, config.sourcePaths.retrospectives);
  if (fs.existsSync(retroPath)) {
    getAllMarkdownFiles(retroPath).forEach(fullPath => {
      const relativePath = getRelativePath(fullPath, repoRoot);
      diskFiles.push({
        path: fullPath,
        relativePath,
        type: 'retro'
      });
    });
  }

  // Find missing files
  const missingFiles = diskFiles.filter(f => !indexedFiles.has(f.relativePath));

  console.log(`📁 Files on disk: ${diskFiles.length}`);
  console.log(`❌ Missing from index: ${missingFiles.length}\n`);

  if (missingFiles.length === 0) {
    console.log('✅ All files are indexed! Nothing to do.');
    db.close();
    return;
  }

  // Show missing files
  console.log('📋 Missing files:');
  missingFiles.forEach(f => console.log(`   - ${f.relativePath}`));
  console.log('');

  if (isDryRun) {
    console.log('🧪 DRY RUN - would index these files. Run without --dry-run to apply.');
    db.close();
    return;
  }

  // Parse missing files into documents
  const documents: OracleDocument[] = [];

  for (const file of missingFiles) {
    const content = fs.readFileSync(file.path, 'utf-8');
    const filename = path.basename(file.path);

    switch (file.type) {
      case 'resonance':
        documents.push(...parseResonanceFile(filename, content));
        break;
      case 'learning':
        documents.push(...parseLearningFile(filename, content));
        break;
      case 'retro':
        documents.push(...parseRetroFile(file.relativePath, content));
        break;
    }
  }

  console.log(`📝 Parsed ${documents.length} documents from ${missingFiles.length} files\n`);

  // Initialize Chroma (optional)
  let chromaClient: ChromaMcpClient | null = null;
  try {
    chromaClient = new ChromaMcpClient('oracle_knowledge', config.vectorPath, '3.12');
    await chromaClient.ensureCollection();
    console.log('✅ ChromaDB connected');
  } catch (e) {
    console.log('⚠️  ChromaDB not available, SQLite-only mode');
  }

  // Prepare statements
  const insertMeta = db.prepare(`
    INSERT OR REPLACE INTO oracle_documents
    (id, type, source_file, concepts, created_at, updated_at, indexed_at, project)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT OR REPLACE INTO oracle_fts (id, content, concepts)
    VALUES (?, ?, ?)
  `);

  const now = Date.now();

  // Insert documents
  const chromaDocs: { id: string; document: string; metadata: any }[] = [];

  for (const doc of documents) {
    // SQLite
    insertMeta.run(
      doc.id,
      doc.type,
      doc.source_file,
      JSON.stringify(doc.concepts),
      doc.created_at,
      doc.updated_at,
      now,
      project
    );

    insertFts.run(doc.id, doc.content, doc.concepts.join(' '));

    // Chroma
    chromaDocs.push({
      id: doc.id,
      document: doc.content,
      metadata: {
        type: doc.type,
        source_file: doc.source_file,
        concepts: doc.concepts.join(',')
      }
    });
  }

  console.log(`✅ Inserted ${documents.length} documents into SQLite`);

  // Batch insert to Chroma
  if (chromaClient && chromaDocs.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < chromaDocs.length; i += BATCH_SIZE) {
      const batch = chromaDocs.slice(i, i + BATCH_SIZE);
      try {
        await chromaClient.addDocuments(batch);
        console.log(`✅ Chroma batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chromaDocs.length / BATCH_SIZE)}`);
      } catch (e) {
        console.error(`❌ Chroma batch failed:`, e);
      }
    }
    await chromaClient.close();
  }

  db.close();

  console.log(`\n🎉 Done! Indexed ${documents.length} new documents from ${missingFiles.length} files.`);
}

main().catch(console.error);
