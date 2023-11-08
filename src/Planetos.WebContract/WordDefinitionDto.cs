namespace Planetos.WebContract;
public class WordDefinitionDto {
    public string name { get; set; }
    public string definition { get; set; }
    public HashSet<InflectionGroupDto> inflectionGroups { get; set; } = new();
    public bool isApproved { get; set; } = false;
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}
