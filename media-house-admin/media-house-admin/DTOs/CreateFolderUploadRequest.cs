namespace MediaHouse.DTOs;

public class CreateFolderUploadRequest
{
    public string folder_name { get; set; } = string.Empty;
    public int total_files { get; set; }
    public long total_size { get; set; }
    public string? root_path { get; set; } // 可选，用于还原文件夹结构
}
