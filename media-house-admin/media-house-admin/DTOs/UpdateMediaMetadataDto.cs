namespace MediaHouse.DTOs;

public class UpdateMediaMetadataDto
{
    public string? Title { get; set; }
    public string? Num { get; set; }
    public string? Summary { get; set; }
    public List<string>? Tags { get; set; }  // 标签名称列表
    public List<ActorUpdateDto>? Actors { get; set; }  // 演员列表
}

public class ActorUpdateDto
{
    public string Name { get; set; } = string.Empty;
    public string? RoleName { get; set; }  // 饰演角色名
    public int? SortOrder { get; set; }  // 排序
}
