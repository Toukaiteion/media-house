using System.Security.Cryptography;
using System.Text;

namespace MediaHouse.Services;

/// <summary>
/// 媒体文件工具类
/// </summary>
public static class MediaUtils
{
    /// <summary>
    /// 根据文件路径 + 文件版本生成 url_name。
    /// 格式：{hash}.{extension}
    ///
    /// 哈希里带上文件大小和修改时间：重新搜刮覆盖了封面/剧照之后 url_name 会变，
    /// 浏览器自然会去拿新图，不会拿着旧缓存（或者更糟：之前加载失败留下的坏缓存）
    /// 继续显示。只按路径哈希的话内容变了 URL 不变，只能等缓存过期。
    /// </summary>
    /// <param name="filePath">文件完整路径</param>
    /// <returns>url_name（10位哈希值.扩展名）</returns>
    public static string GenerateUrlNameFromPath(string filePath)
    {
        var version = "0:0";

        try
        {
            var info = new FileInfo(filePath);
            if (info.Exists)
            {
                version = $"{info.Length}:{info.LastWriteTimeUtc.Ticks}";
            }
        }
        catch
        {
            // 拿不到文件信息就用默认版本号，退化成只按路径哈希
        }

        using var md5 = MD5.Create();
        var bytes = Encoding.UTF8.GetBytes($"{filePath}|{version}");
        var hash = md5.ComputeHash(bytes);
        var hashString = BitConverter.ToString(hash).Replace("-", "").ToLower();
        var shortHash = hashString[..10]; // 取前10位
        var extension = Path.GetExtension(filePath).TrimStart('.');
        return $"{shortHash}.{extension}";
    }
}
