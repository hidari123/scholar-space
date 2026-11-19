# 写一个 CLI 插件

> 让你的独立仓贡献自己的命令。

---

## 1. 为什么要插件

CLI 分两层：

| 层 | 住在哪 | 包含 | 改动影响 |
|---|---|---|---|
| **内核** | 主仓 `cli/` | `sync` `check` `new` `verify` `contract` `release` | 所有仓受益 |
| **插件** | 各独立仓自己 | `deck:new` `post:create` `signup` … | 只影响本仓 |

**例子**：

```
scholarspace-slides 提供 deck:new / deck:serve / deck:export
scholarspace-community 提供 post:create / mod:review
scholarspace-identity 提供 signup / login / bind-email
```

改 PPT 的命令不需要动社区，改社区的不需要动 PPT。

---

## 2. 三步写出插件

### 第 1 步：声明（package.json）

```jsonc
{
  "name": "@scholarspace/slides",
  "version": "0.1.0",
  "type": "module",
  "scholarspace": {
    "commands": "./src/cli-commands.ts"
  }
}
```

### 第 2 步：实现（src/cli-commands.ts）

```ts
import { runNewDeck } from './commands/new-deck';

export const commands = {
  'deck:new': {
    describe: '创建 PPT 项目',
    run: (args) => {
      // args 是命令后面的位置参数
      const name = args[0];
      if (!name) {
        console.error('缺少项目名');
        return 1;
      }
      runNewDeck(name);
      return 0;
    },
  },

  'deck:serve': {
    describe: '本地起 PPT 服务',
    run: async () => {
      await startDevServer();
      return 0;
    },
  },
};
```

### 第 3 步：验证

```bash
cd scholarspace-slides
npx @scholarspace/cli help
# → 会看到「插件命令（本仓提供）：deck:new / deck:serve」

npx @scholarspace/cli deck:new my-deck
```

---

## 3. 命令契约

```ts
interface PluginCommand {
  /** 命令名。必须带命名空间前缀，避免与内核冲突。 */
  name: string;
  /** 一句话说明 —— 会显示在 help 里。 */
  describe: string;
  /** 执行。返回 0 = 成功，非 0 = 失败。 */
  run: (args: string[], context: PluginContext) => Promise<number> | number;
}

interface PluginContext {
  /** 当前工作目录。 */
  cwd: string;
  /** 主仓根目录。 */
  projectRoot: string;
}
```

**规则**：

| 规则 | 原因 |
|---|---|
| 命令名带 `:` 前缀（`deck:new`）| 避免与内核命令（`new` `sync`）冲突 |
| 返回 exit code，不要 `process.exit()` | 让 CLI 统一处理 |
| 用 `context.cwd` 而不是 `process.cwd()` | 便于测试与 `--target` |

---

## 4. 加载机制

CLI 启动时扫描：

1. **当前目录**的 `package.json` —— 在自己仓里跑，自动加载本仓插件
2. **主仓** `packages/*` 与 `tools/*` 中声明了 `scholarspace.commands` 的包

**加载失败降级** —— 插件坏了只警告，不阻断：

```
! 插件 @scholarspace/slides 加载失败：插件入口不存在：./src/cli-commands.ts
✓ 内核命令仍可用
```

---

## 5. 实现细节与坑

### 5.1 package.json 不能有 BOM

Windows PowerShell 的 `Out-File -Encoding utf8` 会写 BOM，导致 `JSON.parse` 直接抛错：

```
SyntaxError: Unexpected token '﻿'
```

CLI 的 manifest 读取已做 BOM 容错，但你自己的脚本也可能踩到。

**用这个写文件**：

```powershell
[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding $false))
```

### 5.2 动态 import 要用 file:// URL

Windows 上直接 `import('C:/path/to/file.mjs')` 会失败：

```ts
// ❌ Windows 上失败
await import(entry);

// ✅ 用 pathToFileURL
import { pathToFileURL } from 'node:url';
await import(pathToFileURL(entry).href);
```

### 5.3 TS 插件需要先构建

CLI 加载的是 **JS**（`.js` / `.mjs`）。TS 源码要先构建：

```jsonc
{
  "scripts": {
    "build:cli": "tsup src/cli-commands.ts --format esm --out-dir dist",
    "prepublishOnly": "pnpm run build:cli"
  },
  "scholarspace": {
    "commands": "./dist/cli-commands.js"
  }
}
```

> 或者用 `tsx` 在运行时直接加载 TS —— 但那要求用户装了 tsx，权衡后选构建。

---

## 6. 内核命令速查

| 命令 | 说明 |
|---|---|
| `sync --kind python\|typescript` | 同步规范基座到本仓 |
| `check` | 检查 extends 是否失效 |
| `new <name> --template <id>` | 创建新项目 |
| `verify` | 跑完整质量门禁 |
| `contract validate\|diff\|generate` | 契约操作 |
| `release check\|bump\|publish\|tag` | 发版操作 |

---

## 7. 完整例子

**scholarspace-identity/src/cli-commands.ts**：

```ts
import { runSignup } from './commands/signup';

export const commands = {
  signup: {
    describe: '创建账号（邮箱/微信/Google/GitHub）',
    run: async (args) => {
      const method = args[0] ?? 'email';
      await runSignup(method);
      return 0;
    },
  },

  'identity:seed': {
    describe: '生成开发用的测试用户',
    run: async () => {
      await seedUsers();
      return 0;
    },
  },
};
```

```bash
npx @scholarspace/cli signup wechat
npx @scholarspace/cli identity:seed
```
