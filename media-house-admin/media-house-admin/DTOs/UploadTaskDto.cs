namespace MediaHouse.DTOs;

public class UploadTaskDto
{
    public string upload_id { get; set; } = string.Empty;
    public int total_chunks { get; set; }
    public string status { get; set; } = string.Empty;
}
