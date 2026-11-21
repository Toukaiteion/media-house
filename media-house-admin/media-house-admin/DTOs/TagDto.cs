namespace MediaHouse.DTOs;

public class TagDto
{
    public string Id { get; set; } = string.Empty;
    public string TagName { get; set; } = string.Empty;
    public int MediaCount { get; set; } // 关联的媒体数量
    public bool IsFavorited { get; set; } // 当前用户是否收藏了该标签
}
