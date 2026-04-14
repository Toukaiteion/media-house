namespace MediaHouse.DTOs;

public class CreateUploadRequest
{
    public string file_name { get; set; } = string.Empty;
    public long file_size { get; set; }
    public string file_md5 { get; set; } = string.Empty;
    public int chunk_size { get; set; } = 5 * 1024 * 1024; // 默认 5MB
}
