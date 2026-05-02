namespace MediaHouse.DTOs;

public class FolderUploadTaskDto
{
    public string FolderId { get; set; } = string.Empty;
    public string FolderName { get; set; } = string.Empty;
    public int TotalFiles { get; set; }
    public int CompletedFiles { get; set; }
    public long TotalSize { get; set; }
    public long UploadedSize { get; set; }
    public double Progress { get; set; }
    public string Status { get; set; } = string.Empty;
    public List<FileUploadInfo> Files { get; set; } = [];
    public string CreatedAt { get; set; } = string.Empty;
    public string? UpdatedAt { get; set; }
}

public class FileUploadInfo
{
    public string UploadId { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? RelativePath { get; set; }
    public long FileSize { get; set; }
    public long UploadedSize { get; set; }
    public double Progress { get; set; }
    public string Status { get; set; } = string.Empty;
}
