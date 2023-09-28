namespace Planetos.WebContract;
public class Inflection {
    public int id { get; set; }
    public string name { get; set; }
    public string value { get; set; }
    public bool isExactMatch { get; set; }
    public int inflectionGroupId { get; set; }
    public DateTime dateCreated { get; set; } = DateTime.Now;
    public DateTime lastUpdated { get; set; } = DateTime.Now;

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is Inflection other && equals(other));
    }

    public override int GetHashCode() {
        return id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(name);
    }

    protected bool equals(Inflection other) {
        return id == other.id ||
               name.Equals(other.name, StringComparison.InvariantCultureIgnoreCase);
    }
}