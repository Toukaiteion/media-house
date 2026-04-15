namespace MediaHouse.DTOs;

public class UploadChunkRequest
{
    public int chunk_index { get; set; }
    public string chunk_data { get; set; } = string.Empty;  // base64 encoded
}
