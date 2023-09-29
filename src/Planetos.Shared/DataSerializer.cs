using Newtonsoft.Json;

namespace Planetos.Shared;
/// <summary>
/// Represents a wrapper around JSON serializer implementation. Default implementation is Microsoft's
/// System.Text.Json.
/// </summary>
public static class DataSerializer {
    /// <inheritdoc cref="IDataSerializer.SerializeObject(Object)"/>
    public static String SerializeObject(Object data, DataSerializerType serializerType = DataSerializerType.Microsoft) {
        return getSerializer(serializerType).SerializeObject(data);
    }

    /// <inheritdoc cref="JsonConvert.DeserializeObject{TDto}(String)"/>
    public static TDto? DeserializeObject<TDto>(String json, DataSerializerType serializerType = DataSerializerType.Microsoft) {
        return getSerializer(serializerType).DeserializeObject<TDto?>(json, false);
    }
    /// <inheritdoc cref="JsonConvert.DeserializeObject{TDto}(String)"/>
    /// <param name="json"><inheritdoc cref="JsonConvert.DeserializeObject{TDto}(String)" path="/param[@name='value']"/></param>
    /// <param name="nullSafe">Returns default instance of requested object if input data is null or empty.</param>
    /// <param name="serializerType">Specifies serialization engine.</param>
    public static TDto? DeserializeObject<TDto>(String json, Boolean nullSafe, DataSerializerType serializerType = DataSerializerType.Microsoft) {
        return getSerializer(serializerType).DeserializeObject<TDto?>(json, nullSafe);
    }
    public static TDto DeserializeObjectSafe<TDto>(String json, DataSerializerType serializerType = DataSerializerType.Microsoft) {
#pragma warning disable CS8603 // Possible null reference return.
        return getSerializer(serializerType).DeserializeObject<TDto>(json, true);
#pragma warning restore CS8603 // Possible null reference return.
    }
    /// <inheritdoc cref="JsonConvert.DeserializeObject(String, Type)"/>
    public static Object? DeserializeObject(String json, Type? type = null, DataSerializerType serializerType = DataSerializerType.Microsoft) {
        return getSerializer(serializerType).DeserializeObject(json, type);
    }

    static IDataSerializer getSerializer(DataSerializerType serializerType = DataSerializerType.Microsoft) {
        switch (serializerType) {
            case DataSerializerType.Newtonsoft:
                return new NewtonsoftSerializer();
            case DataSerializerType.Microsoft:
                return new MicrosoftSerializer();
            default:
                throw new ArgumentOutOfRangeException(nameof(serializerType), serializerType, null);
        }
    }
}
