# scholar-storage

scholarspace 对象存储服务 —— **本地 / MinIO / S3** 一个接口。

## 为什么要有这个

⚠️ **PPT、PDF、论文全文、头像、社区附件** —— 全都要存文件。

不同后端的语义不一样：
- 本地：路径就是键
- MinIO：桶 + 键
- S3：桶 + 键 + 签名

⚠️ **上层不该关心这些** —— 一个端口，三种实现。

## 接口

```python
class ObjectStoragePort(Protocol):
    async def put(key, data, content_type, metadata) -> ObjectInfo
    async def get(key) -> bytes
    async def get_info(key) -> ObjectInfo
    async def exists(key) -> bool
    async def delete(key) -> bool
    async def list(prefix, limit) -> tuple[ObjectInfo, ...]
    async def stream(key, chunk_size) -> AsyncIterator[bytes]
    async def presigned_url(key, expires_seconds) -> str
    async def usage() -> dict[str, int]
```

⚠️ **接口刻意做小** —— 只有真正需要的能力。

## 安全：路径穿越

⚠️ **对象键会拼到 URL 或文件系统路径上** ——
`../../etc/passwd` 这种键能读到不该读的东西。

```python
validate_key(key)  # 挡 .. / 绝对路径 / 空段 / 控制字符
```

⚠️ **本地实现还要再检查一次** ——
符号链接可能指向根目录外面。

## 依赖

⚠️ **领域层零依赖** —— 只有标准库。

⚠️ **`httpx` 是可选的** —— 只有 S3 后端需要：
```bash
pip install "scholarspace-storage[http]"
```
