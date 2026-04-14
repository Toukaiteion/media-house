namespace MediaHouse;

public class StagingSettings
{
    public string StagingPath { get; set; } = "upload-area/staging";
    public int TempFileRetentionDays { get; set; } = 7;
}
