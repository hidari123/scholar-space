import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkNpmPackage } from './release-check';

/** 建一个临时的包目录。 */
function makePackage(manifest: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'relcheck-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2), 'utf8');
  return dir;
}

/** 一个合法的包 manifest。 */
function validManifest(): Record<string, unknown> {
  return {
    name: '@scholarspace/ui',
    version: '0.1.0',
    license: 'MIT',
    files: ['dist'],
    publishConfig: {
      access: 'restricted',
      registry: 'https://npm.pkg.github.com',
    },
  };
}

describe('checkNpmPackage', () => {
  it('合法包通过', () => {
    const result = checkNpmPackage(makePackage(validManifest()));
    expect(result.errors).toEqual([]);
  });

  it('R1 —— file: 依赖被拦截', () => {
    const manifest = validManifest();
    manifest.dependencies = { '@scholarspace/core': 'file:../scholarspace/packages/core' };
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('file:'))).toBe(true);
  });

  it('R1 —— workspace: 依赖被拦截', () => {
    const manifest = validManifest();
    manifest.dependencies = { '@scholarspace/ui': 'workspace:*' };
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('workspace:'))).toBe(true);
  });

  it('R2 —— 缺少 access=restricted 被拦截', () => {
    const manifest = validManifest();
    manifest.publishConfig = { registry: 'https://npm.pkg.github.com' };
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('access'))).toBe(true);
  });

  it('R3 —— registry 不指向 GitHub Packages 被拦截', () => {
    const manifest = validManifest();
    manifest.publishConfig = { access: 'restricted', registry: 'https://registry.npmjs.org' };
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('registry'))).toBe(true);
  });

  it('R5 —— 非法版本号被拦截', () => {
    const manifest = validManifest();
    manifest.version = 'v0.1';
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('semver'))).toBe(true);
  });

  it('R7 —— private 包被拦截', () => {
    const manifest = validManifest();
    manifest.private = true;
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('private'))).toBe(true);
  });

  it('缺少 publishConfig 被拦截', () => {
    const manifest = validManifest();
    delete manifest.publishConfig;
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('publishConfig'))).toBe(true);
  });

  it('缺少 files 被拦截', () => {
    const manifest = validManifest();
    delete manifest.files;
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.errors.some((e) => e.includes('files'))).toBe(true);
  });

  it('files 不含 dist 给出警告', () => {
    const manifest = validManifest();
    manifest.files = ['lib'];
    const result = checkNpmPackage(makePackage(manifest));
    expect(result.warnings.some((w) => w.includes('dist'))).toBe(true);
  });

  it('找不到 package.json 被拦截', () => {
    const result = checkNpmPackage(join(tmpdir(), 'definitely-not-a-package-dir'));
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
