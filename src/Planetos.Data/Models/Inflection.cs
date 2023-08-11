namespace Planetos.Data.Models;
public class Inflection {
    public int Id { get; set; }
    public string Name { get; set; }
    public string Value { get; set; }
    public bool IsExactMatch { get; set; }
    public int InflectionGroupId { get; set; }

    public override bool Equals(object? obj) {
        return !ReferenceEquals(null, obj)
               && ReferenceEquals(this, obj)
               || (obj is Inflection other && equals(other));
    }

    public override int GetHashCode() {
        return Id.GetHashCode() ^
               StringComparer.InvariantCultureIgnoreCase.GetHashCode(Name);
    }

    protected bool equals(Inflection other) {
        return Id == other.Id ||
               Name.Equals(other.Name, StringComparison.InvariantCultureIgnoreCase);
    }
}