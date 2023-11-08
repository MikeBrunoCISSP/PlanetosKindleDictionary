namespace Planetos.Data.Models;
public class WordDefinition {
    public int id { get; set; }
    public string name { get; set; }
    public string definition { get; set; }
    public List<Inflection> inflections { get; set; } = new();
    public int kindleIndexId { get; set; }
    public bool isApproved { get; set; } = false;
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}
