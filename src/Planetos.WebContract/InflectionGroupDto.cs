namespace Planetos.WebContract;
public class InflectionGroupDto {
    public string name { get; set; }
    public HashSet<InflectionDto> inflections { get; set; } = new();
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}
