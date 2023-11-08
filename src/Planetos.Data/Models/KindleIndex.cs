namespace Planetos.Data.Models;
public class KindleIndex {
    public int kindleIndexId { get; set; }
    public string name { get; set; }
    public List<WordDefinition> wordDefinitions { get; set; } = new();
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}
