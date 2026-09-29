using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Deck.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveButtonToggleStyle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ToggleStyle",
                table: "Buttons");

            migrationBuilder.Sql("DELETE FROM Settings WHERE Key = 'appearance.toggleStyle';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ToggleStyle",
                table: "Buttons",
                type: "TEXT",
                nullable: true);
        }
    }
}
