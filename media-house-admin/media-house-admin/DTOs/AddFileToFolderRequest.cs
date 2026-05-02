namespace MediaHouse.DTOs;

public class AddFileToFolderRequest
{
    public string file_name { get; set; } = string.Empty;
    public string relative_path { get; set; } = string.Empty; // 例如: "subfolder/file.mp4"
    public long file_size { get; set; }
    public string file_md5 { get; set; } = string.Empty;
    public int chunk_size { get; set; } = 5 * 1024 * 1024;
}
