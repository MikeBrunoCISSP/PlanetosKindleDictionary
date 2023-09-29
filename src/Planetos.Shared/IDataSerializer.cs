namespace Planetos.Shared;
public interface IDataSerializer {
    String SerializeObject(Object value);
    Object? DeserializeObject(String json, Type? type = null);
    TDto? DeserializeObject<TDto>(String json, Boolean nullSafe);
}
