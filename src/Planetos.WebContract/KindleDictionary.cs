namespace Planetos.WebContract;
public class KindleDictionary {
    public Int32 id { get; set; }
    public String name { get; set; }
    public List<KindleIndex> indicies { get; set; }
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;
}
