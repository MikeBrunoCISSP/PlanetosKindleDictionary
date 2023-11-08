namespace Planetos.Data.Models;
public class Inflection {
    public int inflectionId { get; set; }
    public string value { get; set; }
    public bool isExactMatch { get; set; }
    public int wordDefinitionId { get; set; }
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}