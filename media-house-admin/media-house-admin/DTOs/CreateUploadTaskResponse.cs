namespace MediaHouse.DTOs;

public class CreateUploadTaskResponse
{
    public string upload_id { get; set; } = string.Empty;
    public string file_name { get; set; } = string.Empty;
    public long file_size { get; set; }
    public string file_md5 { get; set; } = string.Empty;
    public int chunk_size { get; set; }
    public int total_chunks { get; set; }
    public int uploaded_chunks { get; set; }
    public long uploaded_size { get; set; }
    public int start_chunk_index { get; set; }
    public double progress { get; set; }
    public string status { get; set; } = string.Empty;
    public string created_at { get; set; } = string.Empty;
    public string? updated_at { get; set; }
    public bool is_new { get; set; }
}
