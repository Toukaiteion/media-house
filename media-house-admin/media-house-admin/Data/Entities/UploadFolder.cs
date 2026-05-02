namespace MediaHouse.Data.Entities;

public class UploadFolder
{
    public string Id { get; set; } = string.Empty;
    public string FolderName { get; set; } = string.Empty;
    public int TotalFiles { get; set; }
    public int CompletedFiles { get; set; }
    public long TotalSize { get; set; }
    public long UploadedSize { get; set; }
    public int Status { get; set; } // 0=待上传，1=上传中，2=已完成，3=已取消，4=失败
    public string? RootPath { get; set; } // 文件夹根路径（用于还原结构）
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    // Navigation property
    public ICollection<UploadTask> Files { get; set; } = [];
}
