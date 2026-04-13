using System.Security.Cryptography;
using System.Text;

namespace MediaHouse.Services;

/// <summary>
/// 媒体文件工具类
/// </summary>
public static class MediaUtils
{
    /// <summary>
    /// 根据文件路径生成固定的 url_name
    /// 格式：{hash}.{extension}
    /// </summary>
    /// <param name="filePath">文件完整路径</param>
    /// <returns>url_name（10位哈希值.扩展名）</returns>
    public static string GenerateUrlNameFromPath(string filePath)
    {
        using var md5 = MD5.Create();
        var bytes = Encoding.UTF8.GetBytes(filePath);
        var hash = md5.ComputeHash(bytes);
        var hashString = BitConverter.ToString(hash).Replace("-", "").ToLower();
        var shortHash = hashString[..10]; // 取前10位
        var extension = Path.GetExtension(filePath).TrimStart('.');
        return $"{shortHash}.{extension}";
    }
}
