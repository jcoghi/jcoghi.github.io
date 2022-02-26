var css_radial = document.querySelector(".h3-radial");
var css_linear = document.getElementById("linear_text");
var color1_r = document.querySelector(".color1_radial");
var color2_r = document.querySelector(".color2_radial");
var color3_r = document.querySelector(".color3_radial");
var color1_l = document.querySelector(".color1_linear");
var color2_l = document.querySelector(".color2_linear");
var radial_div = document.getElementById("radial_div");
var linear_div = document.getElementById("linear_div");

function setRadial(){
    radial_div.style.background = 
    "radial-gradient(closest-side,"
    +color1_r.value+","+color2_r.value+","+color3_r.value+")";

    css_radial.textContent = radial_div.style.background + ";";
}

color1_r.addEventListener("input", setRadial);
color2_r.addEventListener("input", setRadial);
color3_r.addEventListener("input", setRadial);

function setLinear(){
    linear_div.style.background = 
    "linear-gradient(to right," + color1_l.value + "," + color2_l.value + ")";
    
    css_linear.textContent = linear_div.style.background + ";";
}

color1_l.addEventListener("input", setLinear);
color2_l.addEventListener("input", setLinear);
