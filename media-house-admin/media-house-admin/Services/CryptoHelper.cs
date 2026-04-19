using System.Text;

namespace MediaHouse.Services;

public static class CryptoHelper
{
    // 固定的盐值
    private static readonly string _salt = "MH";

    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return string.Empty;

        // 加入盐值：在路径前后各加一个字符
        var salted = _salt + plainText + _salt;

        var bytes = Encoding.UTF8.GetBytes(salted);
        var base64 = Convert.ToBase64String(bytes);

        // URL 安全编码：替换不安全字符
        return base64
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');
    }

    public static string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return string.Empty;

        try
        {
            // 还原 Base64
            var base64 = cipherText
                .Replace('-', '+')
                .Replace('_', '/');

            // 补齐 Padding（=）
            var padLength = 4 - (base64.Length % 4);
            if (padLength > 0)
            {
                base64 += new string('=', padLength);
            }

            var bytes = Convert.FromBase64String(base64);
            var decoded = Encoding.UTF8.GetString(bytes);

            // 移除盐值
            if (decoded.StartsWith(_salt) && decoded.EndsWith(_salt) && decoded.Length > _salt.Length * 2)
            {
                return decoded.Substring(_salt.Length, decoded.Length - _salt.Length * 2);
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }
}
