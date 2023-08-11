using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Planetos.Data.Migrations
{
    /// <inheritdoc />
    public partial class init : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Indices",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    DictionaryId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Indices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WordDefinitions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Definition = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IndexId = table.Column<int>(type: "int", nullable: false),
                    DictionaryIndexId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WordDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WordDefinitions_Indices_DictionaryIndexId",
                        column: x => x.DictionaryIndexId,
                        principalTable: "Indices",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "InflectionGroups",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    WordDefinitionId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InflectionGroups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InflectionGroups_WordDefinitions_WordDefinitionId",
                        column: x => x.WordDefinitionId,
                        principalTable: "WordDefinitions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Inflections",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    Name = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    Value = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    IsExactMatch = table.Column<bool>(type: "bit", nullable: false),
                    InflectionGroupId = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Inflections", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Inflections_InflectionGroups_InflectionGroupId",
                        column: x => x.InflectionGroupId,
                        principalTable: "InflectionGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_InflectionGroups_WordDefinitionId",
                table: "InflectionGroups",
                column: "WordDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_Inflections_InflectionGroupId",
                table: "Inflections",
                column: "InflectionGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_WordDefinitions_DictionaryIndexId",
                table: "WordDefinitions",
                column: "DictionaryIndexId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Inflections");

            migrationBuilder.DropTable(
                name: "InflectionGroups");

            migrationBuilder.DropTable(
                name: "WordDefinitions");

            migrationBuilder.DropTable(
                name: "Indices");
        }
    }
}
